package translations

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/models"
	"github.com/rs/zerolog/log"
	ltr "github.com/snakesel/libretranslate"
)

func Translate(translation *ent.Translation, trx_id int) error {
	log.Debug().Msgf("Translating %d...", trx_id)
	translate := ltr.New(ltr.Config{
		Url: fmt.Sprintf("http://%v", os.Getenv("LIBRETRANSLATE_ENDPOINT")),
	})

	ctx := context.Background()

	// Set status to translating
	_, err := db.Client().Transcription.
		UpdateOneID(trx_id).
		SetStatus(models.TsStatusTranslating).
		Save(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to update transcription status to translating.")
		return err
	}

	// For each segment in the transcription result
	for i, segment := range translation.Result.Segments {
		translatedText, err := translate.Translate(segment.Text, translation.SourceLanguage, translation.TargetLanguage)
		if err != nil {
			log.Debug().Err(err).Msg("Error translating text...")
			return err
		}

		// Split the translated text into words
		translatedWords := SplitIntoWords(translatedText)

		// Calculate the duration of the original segment
		originalSegmentDuration := segment.End - segment.Start

		// Distribute the words evenly across the segment
		translatedSegment := models.Segment{
			Text:  translatedText,
			Start: segment.Start,
			End:   segment.End,
			Words: make([]models.WordData, len(translatedWords)),
		}

		for j, word := range translatedWords {
			// Distribute words evenly based on the count of words
			start := segment.Start + (originalSegmentDuration / float64(len(translatedWords)) * float64(j))
			end := start + (originalSegmentDuration / float64(len(translatedWords)))

			translatedSegment.Words[j] = models.WordData{
				Word:  word,
				Start: start,
				End:   end,
				Score: 1.0,
			}

			if len(segment.Words) > 0 {
				translatedSegment.Words[j].Speaker = segment.Words[j%len(segment.Words)].Speaker
			}
		}

		translation.Result.Segments[i] = translatedSegment
	}

	// Join all segments into translation.Text, to make up the final text
	var translationText string
	for _, result := range translation.Result.Segments {
		translationText += result.Text
	}
	translation.Result.Text = translationText
	translation.Result.Language = translation.TargetLanguage

	// Update the Translation entity
	translation.Status = models.TsStatusDone
	_, err = db.Client().Translation.
		UpdateOne(translation).
		SetResult(translation.Result). // Store the updated result
		SetStatus(models.TsStatusDone).
		Save(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed update translation to db.")
		return err
	}

	// Update the Transcription status
	_, err = db.Client().Transcription.
		UpdateOneID(trx_id).
		SetStatus(models.TsStatusDone).
		Save(ctx)
	if err != nil {
		log.Error().Err(err).Msg("Failed to update transcription status to done.")
		return err
	}
	log.Debug().Msgf("Done translating %d...", trx_id)
	return nil
}

// SplitIntoWords is a helper function that takes a string and
// splits it into separate words (just a stub here, you should implement it properly or use another approach).
func SplitIntoWords(text string) []string {
	// Dummy implementation. Depending on the language and requirements, this could be complex.
	// You might need a full-fledged natural language processing library to handle different languages and scripts properly.
	return strings.Fields(text)
}
