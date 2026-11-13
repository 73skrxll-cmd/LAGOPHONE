//go:build !windows

package main

func gtmInitParent(pid int, stamp string) bool { return false }
func gtmParentAlive() bool                     { return false }
