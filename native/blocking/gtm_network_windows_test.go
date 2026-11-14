//go:build gtm_network_test && windows

package main

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/netip"
	"os"
	"testing"
	"time"

	"github.com/YUNGSLXRD/fnport/windows/internal/wnet"
	"gvisor.dev/gvisor/pkg/buffer"
	"gvisor.dev/gvisor/pkg/tcpip"
	"gvisor.dev/gvisor/pkg/tcpip/adapters/gonet"
	"gvisor.dev/gvisor/pkg/tcpip/header"
	"gvisor.dev/gvisor/pkg/tcpip/link/channel"
	"gvisor.dev/gvisor/pkg/tcpip/network/ipv4"
	"gvisor.dev/gvisor/pkg/tcpip/stack"
	"gvisor.dev/gvisor/pkg/tcpip/transport/tcp"
	"gvisor.dev/gvisor/pkg/tcpip/transport/udp"
)

// This is an isolated network, not a mocked adapter: native Windows sockets traverse
// Wintun A -> production fnport UDP/TCP relay -> Wintun B -> a fixture server.
// Both adapters and all routes are private to this test; no Internet endpoint is needed.
func TestGTMNativeRelay(t *testing.T) {
	remote := netip.MustParseAddr("198.18.254.2")
	serverName := fmt.Sprintf("gtm-net-server-%d", os.Getpid())
	clientName := fmt.Sprintf("gtm-net-client-%d", os.Getpid())
	oldIndex, oldAddr := wnet.PhysIndex, wnet.PhysAddr
	defer func() { wnet.PhysIndex, wnet.PhysAddr = oldIndex, oldAddr }()
	b, bIP, err := wnet.GTMTestTun(serverName, []netip.Prefix{netip.MustParsePrefix("198.18.254.0/24")}, netip.MustParsePrefix("198.18.254.1/24"))
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	uplink, err := wnet.RouteInterface(remote)
	if err != nil {
		t.Fatal(err)
	}
	if uplink.Alias != serverName {
		t.Fatalf("fixture uplink is not selected: %s", uplink.Alias)
	}
	if !uplink.Tunnel {
		t.Fatal("fixture must exercise a virtual uplink")
	}
	wnet.PhysIndex, wnet.PhysAddr = uplink.Index, bIP
	s := stack.New(stack.Options{NetworkProtocols: []stack.NetworkProtocolFactory{ipv4.NewProtocol}, TransportProtocols: []stack.TransportProtocolFactory{tcp.NewProtocol, udp.NewProtocol}})
	defer s.Close()
	ep := channel.New(2048, 1420, "")
	if e := s.CreateNIC(1, ep); e != nil {
		t.Fatal(e)
	}
	if e := s.AddProtocolAddress(1, tcpip.ProtocolAddress{Protocol: ipv4.ProtocolNumber, AddressWithPrefix: tcpip.AddrFrom4(remote.As4()).WithPrefix()}, stack.AddressProperties{}); e != nil {
		t.Fatal(e)
	}
	s.SetRouteTable([]tcpip.Route{{Destination: header.IPv4EmptySubnet, NIC: 1}})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() {
		buf := make([]byte, 2000)
		for {
			n, e := b.ReadPacket(buf)
			if e != nil {
				return
			}
			if n < 20 || buf[0]>>4 != 4 {
				continue
			}
			pkt := stack.NewPacketBuffer(stack.PacketBufferOptions{Payload: buffer.MakeWithData(append([]byte(nil), buf[:n]...))})
			ep.InjectInbound(ipv4.ProtocolNumber, pkt)
			pkt.DecRef()
		}
	}()
	go func() {
		for {
			pkt := ep.ReadContext(ctx)
			if pkt == nil {
				return
			}
			v := pkt.ToView()
			pkt.DecRef()
			b.WritePacket(v.AsSlice())
			v.Release()
		}
	}()
	echo, err := gonet.DialUDP(s, &tcpip.FullAddress{NIC: 1, Addr: tcpip.AddrFrom4(remote.As4()), Port: 9001}, nil, ipv4.ProtocolNumber)
	if err != nil {
		t.Fatal(err)
	}
	defer echo.Close()
	go func() {
		buf := make([]byte, 2000)
		for {
			n, from, e := echo.ReadFrom(buf)
			if e != nil {
				return
			}
			echo.WriteTo(buf[:n], from)
		}
	}()
	ln, err := gonet.ListenTCP(s, tcpip.FullAddress{NIC: 1, Addr: tcpip.AddrFrom4(remote.As4()), Port: 443}, ipv4.ProtocolNumber)
	if err != nil {
		t.Fatal(err)
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	cert := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "GTM test only"}, DNSNames: []string{"discord.com"}, NotBefore: time.Now().Add(-time.Hour), NotAfter: time.Now().Add(time.Hour), KeyUsage: x509.KeyUsageDigitalSignature | x509.KeyUsageCertSign, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}, IsCA: true, BasicConstraintsValid: true}
	der, err := x509.CreateCertificate(rand.Reader, cert, cert, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	roots := x509.NewCertPool()
	roots.AddCert(parsed)
	body := bytes.Repeat([]byte("GTM-real-relay-bytes|"), 8192)
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host != "discord.com" {
			http.Error(w, "wrong host", 400)
			return
		}
		w.Write(body)
	}), ReadHeaderTimeout: 8 * time.Second, TLSConfig: &tls.Config{Certificates: []tls.Certificate{{Certificate: [][]byte{der}, PrivateKey: key}}}}
	defer server.Close()
	go server.Serve(tls.NewListener(ln, server.TLSConfig))
	a, aIP, err := wnet.GTMTestTun(clientName, []netip.Prefix{netip.PrefixFrom(remote, 32)}, netip.MustParsePrefix("10.254.77.2/24"))
	if err != nil {
		t.Fatal(err)
	}
	tr, err := newTCPRelay(a)
	if err != nil {
		a.Close()
		t.Fatal(err)
	}
	defer tr.close()
	cfg := testConfig()
	cfg.routes = []netip.Prefix{netip.PrefixFrom(remote, 32)}
	cfg.fakes = nil
	cfg.maxRounds = 2
	engine := newEngine(cfg, a, aIP, tr)
	go engine.run()
	defer engine.close()
	transport := &http.Transport{Proxy: nil, TLSClientConfig: &tls.Config{RootCAs: roots, ServerName: "discord.com"}, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		var d net.Dialer
		return d.DialContext(ctx, "tcp4", net.JoinHostPort(remote.String(), "443"))
	}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 15 * time.Second}
	response, err := client.Get("https://discord.com/")
	if err != nil {
		t.Fatal("real TLS relay:", err)
	}
	received, err := io.ReadAll(response.Body)
	response.Body.Close()
	if err != nil || !bytes.Equal(received, body) {
		t.Fatalf("TLS relay body mismatch: got %d, expected %d: %v", len(received), len(body), err)
	}
	conn, err := net.DialUDP("udp4", nil, &net.UDPAddr{IP: net.IP(remote.AsSlice()), Port: 9001})
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(10 * time.Second))
	payload := bytes.Repeat([]byte("GTM-game-datagram"), 32)
	if _, err = conn.Write(payload); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 2048)
	n, err := conn.Read(buf)
	if err != nil || !bytes.Equal(payload, buf[:n]) {
		t.Fatalf("game UDP relay mismatch: %v", err)
	}
	counters := engine.stat.snapshot()
	if counters.GameFlows < 1 || counters.Good < 1 || counters.Tested < 1 || tr.total.Load() < 1 {
		t.Fatalf("production relay counters did not observe traffic: %+v", counters)
	}
	t.Logf("Verified %d TLS bytes and %d game UDP bytes through real Wintun adapters and virtual uplink; probed good ports=%d", len(received), n, counters.Good)
}
