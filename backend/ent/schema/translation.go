package schema

import (
	"entgo.io/ent"
	"entgo.io/ent/schema/field"
	"github.com/pluja/anysub/models"
)

// Translation holds the schema definition for the Translation entity.
type Translation struct {
	ent.Schema
}

// Fields of the Translation.
func (Translation) Fields() []ent.Field {
	return []ent.Field{
		field.String("sourceLanguage").StructTag(`json:"sourceLanguage"`),
		field.String("targetLanguage").StructTag(`json:"targetLanguage"`),
		field.Int("status").StructTag(`json:"status"`),
		field.JSON("result", models.TranscriptionResult{}).StructTag(`json:"result"`),
	}
}

// Edges of the Translation.
func (Translation) Edges() []ent.Edge {
	return nil
}
