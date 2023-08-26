package database

import (
	"codeberg.org/pluja/whishper/models"
)

type Db interface {
	NewTranscription(*models.Transcription) (*models.Transcription, error)
	UpdateTranscription(*models.Transcription) (*models.Transcription, error)
	DeleteTranscription(string) error
	GetTranscription(string) *models.Transcription
	GetAllTranscriptions() []*models.Transcription
	GetPendingTranscriptions() []*models.Transcription
}
