package main

import (
	"golang.org/x/sys/windows"
	"time"
)

var gtmParent windows.Handle

func gtmInitParent(pid int, stamp string) bool {
	handle, err := windows.OpenProcess(windows.SYNCHRONIZE|windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
	if err != nil {
		return false
	}
	var create, exit, kernel, user windows.Filetime
	if windows.GetProcessTimes(handle, &create, &exit, &kernel, &user) != nil {
		windows.CloseHandle(handle)
		return false
	}
	expected, e := time.Parse(time.RFC3339Nano, stamp)
	delta := time.Unix(0, create.Nanoseconds()).Sub(expected)
	if e != nil || delta > 15*time.Second || delta < -15*time.Second {
		windows.CloseHandle(handle)
		return false
	}
	gtmParent = handle
	return true
}
func gtmParentAlive() bool {
	status, e := windows.WaitForSingleObject(gtmParent, 0)
	return e == nil && status == uint32(windows.WAIT_TIMEOUT)
}
