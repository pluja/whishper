package worker

import (
	"context"

	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent/transcription"
	"github.com/pluja/anysub/models"
	"github.com/rs/zerolog/log"
)

// Worker package monitors the database and executes jobs

var NewTranscriptionChannel chan bool

func init() {
	NewTranscriptionChannel = make(chan bool, 1000)
}

func Start() {
	log.Info().Msg("Starting worker...")
	go func() {
		client := db.Client()
		for {
			// Wait for new transcription to be added to the database
			<-NewTranscriptionChannel
			pendingTranscriptionsList, _ := client.Transcription.Query().Where(transcription.Status(models.TsStatusPending)).All(context.Background())
			for _, pendingTranscription := range pendingTranscriptionsList {
				log.Debug().Msgf("Taking pending transcription %v", pendingTranscription.ID)
				if pendingTranscription.Status == models.TsStatusPending {
					err := transcribe(pendingTranscription)
					if err != nil {
						log.Err(err).Int("ID", pendingTranscription.ID).Msg("Transcription has failed.")
						pendingTranscription.Status = models.TsStatusError
						client.Transcription.UpdateOneID(pendingTranscription.ID).SetStatus(models.TsStatusError).Save(context.Background())
						continue
					}

					pendingTranscription.Status = models.TsStatusDone
					client.Transcription.UpdateOneID(pendingTranscription.ID).SetStatus(models.TsStatusDone).Save(context.Background())
				}
			}
		}
	}()
}
