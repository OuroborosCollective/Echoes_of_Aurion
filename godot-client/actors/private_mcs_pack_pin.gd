extends RefCounted
## Empty in public builds. A verified private build binds its own isolated
## vendor pack digest into this source before compiling the signed application.
const SHA256 := ""
const PATH := "res://private-mcs/aurion-mcs.pck"
const RESOURCE_PATHS := []
