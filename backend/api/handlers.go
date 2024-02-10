package api

import (
	"fmt"
	"os"
	"time"

	"github.com/goccy/go-json"
	"github.com/gofiber/fiber/v2"
	"github.com/rs/zerolog/log"

	"codeberg.org/pluja/whishper/models"
)

func (s *Server) handleGetAllTranscriptions(c *fiber.Ctx) error {
	transcriptions := s.Db.GetAllTranscriptions()

	// Convert the transcriptions to JSON.
	json, err := json.Marshal(transcriptions)
	if err != nil {
		// 503 On vacation!
		return fiber.NewError(fiber.StatusServiceUnavailable, "On vacation!")
	}

	// Write the JSON to the response body.
	c.Set("Content-Type", "application/json")
	c.Write(json)
	return nil
}

func (s *Server) handleGetTranscriptionById(c *fiber.Ctx) error {
	id := c.Params("id")
	t := s.Db.GetTranscription(id)
	if t == nil {
		log.Warn().Msgf("Transcription with id %v not found", id)
		return fiber.NewError(fiber.StatusNotFound, "Not found")
	}

	// Convert the transcription to JSON.
	json, err := json.Marshal(t)
	if err != nil {
		// 503 On vacation!
		return fiber.NewError(fiber.StatusServiceUnavailable, "On vacation!")
	}

	// Write the JSON to the response body.
	c.Set("Content-Type", "application/json")
	c.Write(json)
	return nil
}

// This function receives data from a form to create a new transcription.
// If the transcription is created successfully, it returns a 201 Created status code and
// broadcasts the new transcription to all ws clients.
func (s *Server) handlePostTranscription(c *fiber.Ctx) error {
	log.Debug().Msg("POST /api/transcriptions")
	var transcription models.Transcription

	// we get the filename from the from
	var filename string
	if c.FormValue("sourceUrl") == "" {
		// Get the form file from the request.
		file, err := c.FormFile("file")
		if err != nil {
			log.Error().Err(err).Msg("Error getting file field from the form")
			return fiber.NewError(fiber.StatusBadRequest, "Bad request")
		}
		timeid := time.Now().Format("2006_01_02-150405000")
		filename = timeid + models.FileNameSeparator + file.Filename
		// if it's empty and there is no sourceurl we set a timestamp-based filename
		if filename == timeid+models.FileNameSeparator {
			filename = timeid + models.FileNameSeparator + time.Now().Format("2006_01_02-150405")
		}

		// Save the file to the uploads directory.
		err = c.SaveFile(file, fmt.Sprintf("%v/%v", os.Getenv("UPLOAD_DIR"), filename))
		if err != nil {
			log.Error().Err(err).Msgf("Error saving the form file to disk into %v", os.Getenv("UPLOAD_DIR"))
			return fiber.NewError(fiber.StatusInternalServerError, "Internal server error")
		}
	}

	// Parse the body into the transcription struct.
	transcription.Language = c.FormValue("language")
	transcription.ModelSize = c.FormValue("modelSize")
	transcription.FileName = filename
	transcription.Status = models.TranscriptionStatusPending
	transcription.Task = "transcribe"
	transcription.SourceUrl = c.FormValue("sourceUrl")
	transcription.Device = c.FormValue("device")
	if transcription.Device != "cpu" && transcription.Device != "cuda" {
		log.Warn().Msgf("Device %v not supported, using cpu", transcription.Device)
		transcription.Device = "cpu"
	}

	log.Debug().Msgf("Transcription: %+v", transcription)
	// Save transcription to database
	res, err := s.Db.NewTranscription(&transcription)
	if err != nil {
		log.Error().Err(err).Msg("Error saving transcription to database")
		return fiber.NewError(fiber.StatusInternalServerError, "Internal server error")
	}

	// Broadcast transcription to websocket clients
	s.BroadcastTranscription(res)
	s.NewTranscriptionCh <- true
	
	// Convert the transcription to JSON.
	json, err := json.Marshal(res)
	if err != nil {
		// 503 On vacation!
		return fiber.NewError(fiber.StatusServiceUnavailable, "On vacation!")
	}

	// Write the JSON to the response body.
	c.Set("Content-Type", "application/json")
	c.Write(json)
	return nil
}

func (s *Server) handleDeleteTranscription(c *fiber.Ctx) error {
	// First get the transcription from the database
	id := c.Params("id")
	t := s.Db.GetTranscription(id)
	if t == nil {
		log.Warn().Msgf("Transcription with id %v not found", id)
		return fiber.NewError(fiber.StatusNotFound, "Not found")
	}

	// Then delete the file from disk
	err := os.Remove(fmt.Sprintf("%v/%v", os.Getenv("UPLOAD_DIR"), t.FileName))
	if err != nil {
		log.Error().Err(err).Msgf("Error deleting file %v", t.FileName)
	}

	// Finally delete the transcription from the database
	err = s.Db.DeleteTranscription(id)
	if err != nil {
		log.Error().Err(err).Msgf("Error deleting transcription %v", id)
		return fiber.NewError(fiber.StatusInternalServerError, "Internal server error")
	}

	// Return status deleted
	c.Status(fiber.StatusOK)
	return nil
}

func (s *Server) handlePatchTranscription(c *fiber.Ctx) error {
	var transcription models.Transcription
	// Parse the body into the transcription struct.
	err := json.Unmarshal(c.Body(), &transcription)
	if err != nil {
		log.Error().Err(err).Msg("Error parsing JSON body")
		return fiber.NewError(fiber.StatusBadRequest, "Bad request")
	}

	// Update the transcription in the database
	ut, err := s.Db.UpdateTranscription(&transcription)
	if err != nil {
		log.Error().Err(err).Msgf("Error updating transcription")
		if err.Error() == "no documents were modified" {
			return fiber.NewError(fiber.StatusNotModified, "Not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, "Internal server error")
	}

	// Write the JSON to the response body.
	s.BroadcastTranscription(ut)

	// Return status ok
	json, err := json.Marshal(&ut)
	if err != nil {
		// 503 On vacation!
		return fiber.NewError(fiber.StatusInternalServerError, "Error parsing json!")
	}

	c.Status(fiber.StatusOK)
	c.Write(json)
	return nil
}

func (s *Server) handleTranslate(c *fiber.Ctx) error {
	id := c.Params("id")
	targetLang := c.Params("target")

	transcription := s.Db.GetTranscription(id)

	// Set status as translating
	transcription.Status = models.TrannscriptionStatusTranslating
	s.Db.UpdateTranscription(transcription)
	s.BroadcastTranscription(transcription)

	err := transcription.Translate(targetLang)
	if err != nil {
		log.Debug().Err(err).Msg("Error with translation")
		return err
	}

	// Set as done
	transcription.Status = models.TranscriptionStatusDone
	s.Db.UpdateTranscription(transcription)
	s.BroadcastTranscription(transcription)
	return nil
}
