package utils

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
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

// Returns true if the string contains a Unicode punctuation character
// Returns true if the string contains a Unicode punctuation character that implies a long pause or a logical new line in subtitles
func ContainsPunctuation(s string) bool {
	longPausePunctuation := []rune{'.', '!', '?', '…'}
	for _, r := range s {
		for _, lpp := range longPausePunctuation {
			if r == lpp {
				return true
			}
		}
	}
	return false
}

func ToString(value any) string {
	if value == nil {
		return ""
	}

	switch val := value.(type) {
	case float32:
		return strconv.FormatFloat(float64(val), 'f', -1, 32)
	case float64:
		return strconv.FormatFloat(val, 'f', -1, 64)
	case int:
		return strconv.FormatInt(int64(val), 10)
	case int8:
		return strconv.FormatInt(int64(val), 10)
	case int16:
		return strconv.FormatInt(int64(val), 10)
	case int32:
		return strconv.FormatInt(int64(val), 10)
	case int64:
		return strconv.FormatInt(val, 10)
	case uint:
		return strconv.FormatUint(uint64(val), 10)
	case uint8:
		return strconv.FormatUint(uint64(val), 10)
	case uint16:
		return strconv.FormatUint(uint64(val), 10)
	case uint32:
		return strconv.FormatUint(uint64(val), 10)
	case uint64:
		return strconv.FormatUint(val, 10)
	case string:
		return val
	case []byte:
		return string(val)
	default:
		b, err := json.Marshal(val)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

func DateString(t string) string {
	if t == "" {
		return "Unknown"
	}

	layout := "2006-01-02 15:04:05.000Z"

	tm, err := time.Parse(layout, t)
	if err != nil {
		return t
	}
	return tm.Format("2006-01-02")
}
