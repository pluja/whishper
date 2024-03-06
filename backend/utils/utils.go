package utils

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func SecureFilename(input string) string {
	name := strings.TrimSuffix(input, filepath.Ext(input))
	ext := filepath.Ext(input)

	reg := regexp.MustCompile(`[^a-zA-Z0-9]+`)
	safeName := reg.ReplaceAllString(name, "_")
	safeName = strings.Trim(safeName, "_")
	safeName = regexp.MustCompile(`_+`).ReplaceAllString(safeName, "_")

	return safeName + ext
}

// Given a filename like ${uuid}-SecureFilename.mp4, it returns the filename without the uuid.
func WithoutUuid(input string) string {
	return strings.Split(input, "-")[1]
}

func Getenv(key, def string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return def
}
