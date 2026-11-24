//go:build !windows

package main

import "fmt"

// Mahzen kabuğu yalnız Windows'ta çalışır (WebView2). Bu dosya Linux'ta go test / go vet içindir.
func main() { fmt.Println("Mahzen masaüstü kabuğu yalnız Windows içindir.") }
