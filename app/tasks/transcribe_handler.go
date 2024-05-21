package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"
	"github.com/pluja/anysub/db"
	"github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/models"
)

const (
	TypeTranscription = "transcription:create"
)

var client = db.Client()

func NewTranscriptionTask(tx ent.Transcription) (*asynq.Task, error) {
	payload, err := json.Marshal(tx)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeTranscription, payload), nil
}

func HandleNewTranscriptionTask(ctx context.Context, t *asynq.Task) error {
	var tx ent.Transcription
	if err := json.Unmarshal(t.Payload(), &tx); err != nil {
		return fmt.Errorf("json.Unmarshal failed: %v: %w", err, asynq.SkipRetry)
	}

	log.Printf("Transcribing: ID=%d, FileName=%s", tx.ID, tx.FileName)

	client.Transcription.UpdateOneID(tx.ID).SetStatus(models.TsStatusTranscribing).Save(context.Background())
	err := transcribe(&tx)
	if err != nil {
		client.Transcription.UpdateOneID(tx.ID).SetStatus(models.TsStatusError).Save(context.Background())
		return err
	}
	client.Transcription.UpdateOneID(tx.ID).SetStatus(models.TsStatusDone).Save(context.Background())
	return nil
}
