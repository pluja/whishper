package api

import (
	"github.com/goccy/go-json"
	"github.com/gofiber/contrib/websocket"
	"github.com/rs/zerolog/log"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"codeberg.org/pluja/whishper/models"
)

func (s *Server) handleWebsocketMessage(wsess *websocket.Conn, msg []byte) {
	log.Info().Msgf("Received message from client: %v", wsess.RemoteAddr().String())
	// Try to unmarshal message to transcription
	var transcription models.Transcription
	err := json.Unmarshal(msg, &transcription)
	if err != nil {
		log.Error().Err(err).Msg("Error unmarshalling message to transcription:")
		return
	}

	var res *models.Transcription
	// Check if the transcription has a valid ID
	// If it has ID, it means it's an update
	if transcription.ID != primitive.NilObjectID {
		log.Printf("Updating transcription: %v", transcription.ID)
		// Update transcription in database
		res, err = s.Db.UpdateTranscription(&transcription)
		if err != nil {
			log.Error().Err(err).Msg("Error updating transcription in database:")
			return
		}
		log.Printf("Updated transcription in database: %v", res)
	} else {
		log.Error().Msgf("Transcription not updated, it does not have an ID")
		return
	}

	// broadcast with gofiber websocket
	s.BroadcastTranscription(res)
}
