// user.go
package schema

import (
	"context"

	"entgo.io/ent"
	"entgo.io/ent/schema/edge"
	"entgo.io/ent/schema/field"
	"golang.org/x/crypto/bcrypt"

	gen "github.com/pluja/anysub/ent"
	"github.com/pluja/anysub/ent/hook"
)

// User holds the schema definition for the User entity.
type User struct {
	ent.Schema
}

// Fields of the User.
func (User) Fields() []ent.Field {
	return []ent.Field{
		field.String("email").Unique().StructTag(`json:"email"`),
		field.String("password").Sensitive(), // Sensitive marks field private and vulnerable
		// Add other necessary fields
	}
}

// Edges of the User.
func (User) Edges() []ent.Edge {
	return []ent.Edge{
		edge.To("transcriptions", Transcription.Type),
	}
}

// Hooks of the User.
func (User) Hooks() []ent.Hook {
	return []ent.Hook{
		SetPasswordHook(),
	}
}

// SetPasswordHook creates a hook for hashing passwords.
func SetPasswordHook() ent.Hook {
	return hook.On(
		func(next ent.Mutator) ent.Mutator {
			return hook.UserFunc(func(ctx context.Context, m *gen.UserMutation) (ent.Value, error) {
				// Check if password was set
				password, exists := m.Password()
				if exists {
					hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
					if err != nil {
						return nil, err
					}
					m.SetPassword(string(hashedPassword))
				}

				// Call the next hook
				return next.Mutate(ctx, m)
			})
		},
		ent.OpCreate|ent.OpUpdateOne,
	)
}
