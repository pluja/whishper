package schema

import (
	"time"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"github.com/pluja/anysub/models"
)

// Transcription holds the schema definition for the Transcription entity.
type Transcription struct {
	ent.Schema
}

// Fields of the Transcription.
func (Transcription) Fields() []ent.Field {
	return []ent.Field{
		field.String("status").StructTag(`json:"status"`).Default("pending"),
		field.Bool("diarize").StructTag(`json:"diarize"`).Default(false),
		field.String("language").StructTag(`json:"language"`).Default("auto"),
		field.String("task").StructTag(`json:"task"`).Default("transcribe"),
		field.String("device").StructTag(`json:"device"`).Default("cpu"),
		field.String("modelSize").StructTag(`json:"modelSize"`).Default("small"),
		field.String("sourceUrl").StructTag(`json:"sourceUrl"`).Optional(),
		field.String("fileName").StructTag(`json:"fileName"`).Optional(),
		field.JSON("result", models.TranscriptionResult{}).StructTag(`json:"result"`).Optional(),
		field.Time("createdAt").Default(time.Now).StructTag(`json:"createdAt"`),
	}
}

// Edges of the Transcription.
func (Transcription) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("translations", Translation.Type),
	}
}
