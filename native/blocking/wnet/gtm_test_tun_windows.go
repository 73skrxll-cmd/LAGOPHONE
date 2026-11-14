//go:build gtm_network_test && windows

package wnet

import "net/netip"

// Used only by the isolated Windows integration test, never included in the shipped helper.
func GTMTestTun(name string, routes []netip.Prefix, address netip.Prefix) (Dev, netip.Addr, error) {
	old := tunAddr
	tunAddr = address
	defer func() { tunAddr = old }()
	return OpenTun(name, routes)
}
