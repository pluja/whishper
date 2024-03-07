package utils

import (
	"fmt"
	"strings"
	"time"

	"github.com/duke-git/lancet/v2/slice"
	"github.com/pluja/anysub/ent"
)

var (
	colors = []string{
		"aqua",
		"yellow",
		"lime",
		"aquamarine",
		"blue",
		"blueviolet",
		"mediumpurple",
		"orange",
		"springgreen",
		"tomato",
		"red",
		"pink",
		"brown",
	}
)

type SubtitleConfig struct {
	ColorizeSpeakers bool              `json:"colorize_speakers"`
	MaxLengthChars   int               `json:"max_length_chars"`
	SpeakerColors    map[string]string `json:"speaker_colors"`
}

func GenerateSubsVTT(t *ent.Transcription, c SubtitleConfig) string {
	var vttBuilder strings.Builder

	vttBuilder.WriteString("WEBVTT\n\n")

	if c.ColorizeSpeakers {
		addSpeakersStyle(&vttBuilder, t, c.SpeakerColors)
	}

	buildWordSubtitles(&vttBuilder, t, c)

	return vttBuilder.String()
}

func buildWordSubtitles(b *strings.Builder, t *ent.Transcription, c SubtitleConfig) {
	cueCounter := 1
	var currentSpeaker string
	var cueWords []string
	var cueCharsCount int
	var startTime, endTime float64

	for _, segment := range t.Result.Segments {
		for _, word := range segment.Words {
			if cueCharsCount == 0 {
				startTime = word.Start
			}
			if word.Speaker != currentSpeaker && currentSpeaker != "" {
				endTime = word.Start
				writeCue(b, cueCounter, startTime, endTime, currentSpeaker, cueWords)
				cueCounter++
				cueWords = cueWords[:0]
				cueCharsCount = 0
			}
			currentSpeaker = word.Speaker

			if cueCharsCount+len(word.Word)+1 <= c.MaxLengthChars {
				cueWords = append(cueWords, word.Word)
				cueCharsCount += len(word.Word) + 1
			} else {
				endTime = word.Start
				writeCue(b, cueCounter, startTime, endTime, currentSpeaker, cueWords)
				cueCounter++
				cueWords = []string{word.Word}
				cueCharsCount = len(word.Word) + 1
				startTime = word.Start
			}
			endTime = word.End
		}
	}
	if len(cueWords) > 0 {
		writeCue(b, cueCounter, startTime, endTime, currentSpeaker, cueWords)
	}
}

func writeCue(b *strings.Builder, cueCounter int, startTime, endTime float64, speaker string, words []string) {
	b.WriteString(fmt.Sprintf("%d\n", cueCounter))
	b.WriteString(fmt.Sprintf("%s --> %s\n", formatVTTTime(startTime), formatVTTTime(endTime)))
	if speaker != "" {
		b.WriteString(fmt.Sprintf("<v %s>", speaker))
	}
	cueText := strings.Join(words, " ")
	// Ensure we split at punctuation if possible
	// TODO: Make punctuation splits separate cues.
	if idx := strings.LastIndexAny(cueText, ".!?,;:"); idx != -1 && idx < len(cueText)-1 {
		cueText = cueText[:idx+1] + "\n" + cueText[idx+2:]
	}
	b.WriteString(cueText + "\n\n")
}

func addSpeakersStyle(b *strings.Builder, t *ent.Transcription, customColors map[string]string) {
	b.WriteString("STYLE\n")
	speakerColors := make(map[string]string)

	for _, segment := range t.Result.Segments {
		for _, word := range segment.Words {
			if _, ok := speakerColors[word.Speaker]; !ok && word.Speaker != "" {
				if color, ok := customColors[word.Speaker]; ok {
					speakerColors[word.Speaker] = color
				} else {
					color, _ = slice.Random(colors)
					speakerColors[word.Speaker] = color
				}
				color := speakerColors[word.Speaker]
				b.WriteString(fmt.Sprintf("::cue(v[voice=\"%s\"]) { color: %s; }\n", word.Speaker, color))
			}
		}
	}
	b.WriteString("\n")
}

func formatVTTTime(seconds float64) string {
	t := time.Duration(seconds * float64(time.Second))
	hours := t / time.Hour
	t -= hours * time.Hour
	minutes := t / time.Minute
	t -= minutes * time.Minute
	seconds = t.Seconds()
	return fmt.Sprintf("%02d:%02d:%06.3f", hours, minutes, seconds)
}
