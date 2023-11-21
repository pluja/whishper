package database

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/rs/zerolog/log"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"codeberg.org/pluja/whishper/models"
)

type MongoDb struct {
	client *mongo.Client
}

func NewMongoDb() *MongoDb {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var client *mongo.Client
	var err error
	mongoUri := fmt.Sprintf("mongodb://%v", os.Getenv("DB_ENDPOINT"))
	credentials := options.Credential{
		Username: os.Getenv("DB_USER"),
		Password: os.Getenv("DB_PASS"),
	}

	// Set auth method to PLAIN if using FerretDB
	if os.Getenv("FERRETDB_ENABLED") != "" {
		log.Printf("FerretDB enabled, setting auth mechanism to PLAIN...")
		credentials.AuthMechanism = "PLAIN"
	}

	client, err = mongo.Connect(ctx, options.Client().ApplyURI(mongoUri).SetAuth(credentials))
	if err != nil {
		log.Error().Err(err).Msg("Error connecting to mongodb")
	}
	return &MongoDb{
		client: client,
	}
}

func (m *MongoDb) GetTranscription(id string) *models.Transcription {
	collection := m.client.Database("whishper").Collection("transcriptions")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		log.Printf("Error converting id to object id: %v", err)
		return nil
	}
	filter := bson.D{primitive.E{Key: "_id", Value: oid}}
	var result models.Transcription
	err = collection.FindOne(ctx, filter).Decode(&result)
	if err != nil {
		log.Printf("Error getting transcription: %v", err)
		return nil
	}
	return &result
}

func (m *MongoDb) DeleteTranscription(id string) error {
	collection := m.client.Database("whishper").Collection("transcriptions")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		log.Debug().Msg("Error converting id to object id.")
		return err
	}

	filter := bson.D{primitive.E{Key: "_id", Value: oid}}
	_, err = collection.DeleteOne(ctx, filter)
	if err != nil {
		log.Debug().Msg("Error deleting transcription")
		return err
	}
	return nil
}

func (m *MongoDb) NewTranscription(t *models.Transcription) (*models.Transcription, error) {
	collection := m.client.Database("whishper").Collection("transcriptions")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Create a new mongodb object id
	i, err := collection.InsertOne(ctx, t)
	if err != nil {
		log.Printf("Error creating new transcription: %v", err)
		return nil, err
	}
	// Set the id of the transcription to the mongodb object id
	t.ID = i.InsertedID.(primitive.ObjectID)
	return t, nil
}

func (s *MongoDb) GetAllTranscriptions() []*models.Transcription {
	collection := s.client.Database("whishper").Collection("transcriptions")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cursor, err := collection.Find(ctx, bson.D{})
	if err != nil {
		log.Printf("Error getting transcriptions: %v", err)
		return nil
	}
	defer cursor.Close(ctx)

	var transcriptions []*models.Transcription
	for cursor.Next(ctx) {
		var result models.Transcription
		err := cursor.Decode(&result)
		if err != nil {
			log.Printf("Error decoding transcription: %v", err)
			return nil
		}
		transcriptions = append(transcriptions, &result)
	}
	if err := cursor.Err(); err != nil {
		log.Printf("Error getting transcriptions: %v", err)
		return nil
	}
	return transcriptions
}

func (s *MongoDb) GetPendingTranscriptions() []*models.Transcription {
	collection := s.client.Database("whishper").Collection("transcriptions")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.D{primitive.E{Key: "status", Value: models.TranscriptionStatusPending}}
	cursor, err := collection.Find(ctx, filter)
	if err != nil {
		log.Printf("Error getting transcriptions: %v", err)
		return nil
	}

	defer cursor.Close(ctx)
	var transcriptions []*models.Transcription
	for cursor.Next(ctx) {
		var result models.Transcription
		err := cursor.Decode(&result)
		if err != nil {
			log.Printf("Error decoding transcription: %v", err)
			return nil
		}
		transcriptions = append(transcriptions, &result)
	}

	return transcriptions
}

func (m *MongoDb) UpdateTranscription(t *models.Transcription) (*models.Transcription, error) {
	collection := m.client.Database("whishper").Collection("transcriptions")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	filter := bson.D{primitive.E{Key: "_id", Value: t.ID}}
	updateQuery := bson.D{primitive.E{Key: "$set", Value: t}}
	updateResult, err := collection.UpdateOne(ctx, filter, updateQuery)
	if err != nil {
		return nil, err
	}

	if updateResult.MatchedCount == 0 {
		return nil, errors.New("no documents matched the filter")
	}
	if updateResult.ModifiedCount == 0 {
		return nil, errors.New("no documents were modified")
	}

	return t, nil
}
