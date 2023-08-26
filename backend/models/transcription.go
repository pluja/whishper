package models

import (
	"fmt"
	"os"

	"github.com/rs/zerolog/log"
	ltr "github.com/snakesel/libretranslate"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Transcription struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Status       int                `bson:"status" json:"status"`
	Language     string             `bson:"language" json:"language"`
	ModelSize    string             `bson:"modelSize" json:"modelSize"`
	Task         string             `bson:"task" json:"task"`
	Device       string             `bson:"device" json:"device"`
	FileName     string             `bson:"fileName" json:"fileName"`
	SourceUrl    string             `bson:"sourceUrl" json:"sourceUrl"`
	Result       WhisperResult      `bson:"result" json:"result"`
	Translations []Translation      `bson:"translations" json:"translations"`
}

func (t *Transcription) Translate(target string) error {
	for _, translation := range t.Translations {
		if translation.TargetLanguage == target {
			log.Debug().Msgf("Translation for %v already exists!", target)
			return fmt.Errorf("translation for %v already exists", target)
		}
	}

	translate := ltr.New(ltr.Config{
		Url: fmt.Sprintf("http://%v", os.Getenv("TRANSLATION_ENDPOINT")),
	})

	var translation Translation
	translation.SourceLanguage = t.Language
	translation.TargetLanguage = target

	trtext, err := translate.Translate(t.Result.Text, translation.SourceLanguage, translation.TargetLanguage)
	if err != nil {
		log.Debug().Err(err).Msgf("Error translating text...")
		return err
	}
	translatedText := trtext

	translatedSegments := make([]Segment, len(t.Result.Segments))
	copy(translatedSegments, t.Result.Segments)
	for i, seg := range t.Result.Segments {
		trtext, err := translate.Translate(seg.Text, translation.SourceLanguage, translation.TargetLanguage)
		if err != nil {
			log.Debug().Err(err).Msgf("Error translating segment text...")
			return err
		}
		translatedSegments[i].Text = trtext
		// Word-level data is lost, since we can't make sure that words will be in the same order and number as the final translation.
		// For example, if we translate "The big home" to Spanish, we could get "La casa grande", thus words changed order.
		translatedSegments[i].Words = []Word{}
	}

	translation.Result.Text = translatedText
	translation.Result.Segments = translatedSegments
	translation.Result.Language = translation.TargetLanguage
	t.Translations = append(t.Translations, translation)
	return nil
}
