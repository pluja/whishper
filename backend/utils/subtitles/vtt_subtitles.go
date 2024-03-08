package subtitles

import (
	"fmt"
	"strings"
	"time"

	"github.com/duke-git/lancet/v2/slice"
	"github.com/pluja/anysub/models"
	"github.com/pluja/anysub/utils"
)

var (
	vttColors = []string{
		"yellow",
		"aqua",
		"lime",
		"aquamarine",
		"skyblue",
		"mediumslateblue",
		"violet",
		"orange",
		"springgreen",
		"tomato",
		"red",
		"pink",
		"ivory",
	}
)

func GenerateSubsVTT(t models.TranscriptionResult, c SubtitleConfig) string {
	var vttBuilder strings.Builder

	vttBuilder.WriteString("WEBVTT\n\n")

	if c.ColorizeSpeakers {
		addVttSpeakerStyle(&vttBuilder, t, c.SpeakerColors)
	}

	buildVttWordSubtitles(&vttBuilder, t, c)

	return vttBuilder.String()
}

func buildVttWordSubtitles(b *strings.Builder, t models.TranscriptionResult, c SubtitleConfig) {
	cueCounter := 1
	var currentSpeaker string
	var cueWords []string
	var cueCharsCount int
	var startTime, endTime float64
	var lastWordHadPunctuation bool

	for _, segment := range t.Segments {
		for _, word := range segment.Words {
			if cueCharsCount == 0 {
				// First word, marks the start time.
				startTime = word.Start
			}

			if word.Speaker != currentSpeaker && currentSpeaker != "" {
				// New speaker, we must end the cue here.
				// The current work marks the end time of the cue
				endTime = word.Start

				// We write the cue.
				writeVttCue(b, cueCounter, startTime, endTime, currentSpeaker, cueWords)

				cueCounter++
				cueWords = cueWords[:0]
				cueCharsCount = 0
			}

			// We assign the speaker
			currentSpeaker = word.Speaker

			if cueCharsCount+len(word.Word)+1 <= c.MaxLengthChars && !lastWordHadPunctuation {
				// If the current cue still fits in the MaxLength
				// we add the word, and increment the char count.
				cueWords = append(cueWords, word.Word)
				cueCharsCount += len(word.Word) + 1
			} else {
				// If we reached the MaxLengthChars, we must end the cue.
				endTime = word.Start

				// And write it
				writeVttCue(b, cueCounter, startTime, endTime, currentSpeaker, cueWords)

				cueCounter++
				cueWords = []string{word.Word}
				cueCharsCount = len(word.Word) + 1
				startTime = word.Start
			}

			endTime = word.End
			lastWordHadPunctuation = utils.ContainsPunctuation(word.Word)
		}
	}

	// If we reach the end, and the cue has words left, we write them
	if len(cueWords) > 0 {
		writeVttCue(b, cueCounter, startTime, endTime, currentSpeaker, cueWords)
	}
}

func writeVttCue(b *strings.Builder, cueCounter int, startTime, endTime float64, speaker string, words []string) {
	b.WriteString(fmt.Sprintf("%d\n", cueCounter))
	b.WriteString(fmt.Sprintf("%s --> %s\n", formatVTTTime(startTime), formatVTTTime(endTime)))
	if speaker != "" {
		b.WriteString(fmt.Sprintf("<v %s>", speaker))
	}
	cueText := strings.Join(words, " ")

	b.WriteString(cueText + "\n\n")
}

func addVttSpeakerStyle(b *strings.Builder, t models.TranscriptionResult, customColors map[string]string) {
	b.WriteString("STYLE\n")
	speakerColors := make(map[string]string)

	for _, segment := range t.Segments {
		for _, word := range segment.Words {
			if _, ok := speakerColors[word.Speaker]; !ok && word.Speaker != "" {
				if color, ok := customColors[word.Speaker]; ok {
					speakerColors[word.Speaker] = color
				} else {
					color, _ = slice.Random(vttColors)
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
