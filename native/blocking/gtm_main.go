// GTM PC adapter for YUNGSLXRD/fnport v0.6.3 (MIT). No GUI, account, or WARP registration.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"github.com/YUNGSLXRD/fnport/windows/internal/wnet"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var gtmAdapterName string

func gtmWrite(directory string, value any) {
	b, err := json.Marshal(value)
	if err != nil {
		return
	}
	p := filepath.Join(directory, "fnport-state.json")
	if os.WriteFile(p+".tmp", b, 0600) == nil {
		os.Rename(p+".tmp", p)
	}
}
func gtmStopped(dir string) bool {
	if _, e := os.Stat(filepath.Join(dir, "fnport-stop")); e == nil {
		return true
	}
	if _, e := os.Stat(filepath.Join(dir, "stop")); e == nil {
		return true
	}
	s, e := os.Stat(filepath.Join(dir, "heartbeat"))
	return e != nil || time.Since(s.ModTime()) > 12*time.Second || !gtmParentAlive()
}
func gtmRun() error {
	dir := flag.String("control", "", "owned control directory")
	mode := flag.String("mode", "", "run, check or self-test")
	parent := flag.Int("parent", 0, "supervisor PID")
	started := flag.String("parent-start", "", "supervisor start time UTC")
	fake := flag.String("fake", "quic_initial_vk_com.bin", "pinned fake")
	ttl := flag.Int("ttl", 5, "fake TTL")
	flag.Parse()
	if *mode == "self-test" {
		if _, err := defaultSettings().config(); err != nil {
			return err
		}
		fmt.Println("GTM fnport core 0.6.3 OK")
		return nil
	}
	if *mode != "run" && *mode != "check" {
		return fmt.Errorf("unsupported action")
	}
	if *dir == "" || *parent < 1 || !gtmInitParent(*parent, *started) {
		return fmt.Errorf("invalid supervisor")
	}
	info, e := os.Stat(*dir)
	if e != nil || !info.IsDir() {
		return fmt.Errorf("control directory missing")
	}
	allowed := *fake == ""
	for _, f := range []string{"quic_initial_vk_com.bin", "quic_initial_ozon_ru.bin", "quic_initial_gosuslugi_ru.bin"} {
		if *fake == f {
			allowed = true
		}
	}
	if !allowed || *ttl < 1 || *ttl > 9 {
		return fmt.Errorf("invalid fnport setting")
	}
	gtmAdapterName = fmt.Sprintf("fnport-GTMPC-%d", os.Getpid())
	version = "0.6.3 / GTM PC"
	s := defaultSettings()
	s.Warp.Enabled = false
	s.Fake = *fake
	s.FakeTTL = *ttl
	if gtmStopped(*dir) {
		return nil
	}
	for _, i := range wnet.Interfaces() {
		if strings.HasPrefix(strings.ToLower(i.Alias), "fnport") {
			return fmt.Errorf("другой fnport уже включён; отключите его перед запуском в GTM PC")
		}
	}
	physicalInfo, err := physical("")
	if err != nil {
		return err
	}
	// Tunnel is an upstream heuristic (also true for virtual Ethernet). It is not proof
	// of an active VPN and must not veto the original fnport forwarding path.
	uplink := map[string]any{"name": physicalInfo.Alias, "description": physicalInfo.Desc, "virtual": physicalInfo.Tunnel}
	usePhysical("")
	c := newController(s)
	defer c.stop()
	if *mode == "check" {
		k := &checker{}
		if !k.start(s) {
			return fmt.Errorf("проверка пока недоступна")
		}
		for {
			if gtmStopped(*dir) {
				gtmWrite(*dir, map[string]any{"phase": "stopped", "message": "Проверка отменена"})
				return nil
			}
			running, lines, result, _ := k.state()
			safe := make([]string, len(lines))
			for i, v := range lines {
				safe[i] = maskAddresses(v)
			}
			data := map[string]any{"phase": "checking", "lines": safe, "updatedAt": time.Now().UTC(), "uplink": uplink}
			if !running && result != nil {
				data["phase"] = "checked"
				data["result"] = map[string]any{"portKept": result.PortKept, "freeze": result.Freeze, "fake": result.Fake, "ttl": result.TTL, "fakeFile": result.FakeFile, "summary": result.Summary, "epic": result.Epic, "control": result.Control}
				if result.Recommend != nil {
					data["recommend"] = map[string]any{"fake": result.Recommend.Fake, "ttl": result.Recommend.FakeTTL}
				}
				gtmWrite(*dir, data)
				return nil
			}
			gtmWrite(*dir, data)
			time.Sleep(500 * time.Millisecond)
		}
	}
	gtmWrite(*dir, map[string]any{"phase": "starting", "updatedAt": time.Now().UTC(), "uplink": uplink})
	c.start()
	st, message := c.state()
	if st != stateOn {
		return fmt.Errorf("%s", message)
	}
	for !gtmStopped(*dir) {
		stats := c.totals()
		state := map[string]any{"phase": "running", "adapter": gtmAdapterName, "stats": stats, "updatedAt": time.Now().UTC(), "gameConnections": len(c.flows()), "uplink": uplink}
		gtmWrite(*dir, state)
		time.Sleep(time.Second)
	}
	c.stop()
	gtmWrite(*dir, map[string]any{"phase": "stopped", "updatedAt": time.Now().UTC(), "uplink": uplink})
	return nil
}
func main() {
	if err := gtmRun(); err != nil {
		for i, arg := range os.Args {
			if arg == "--control" && i+1 < len(os.Args) {
				gtmWrite(os.Args[i+1], map[string]any{"phase": "error", "message": maskAddresses(err.Error()), "updatedAt": time.Now().UTC()})
			}
		}
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
