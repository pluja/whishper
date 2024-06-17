// password.go
package utils

import (
	"golang.org/x/crypto/bcrypt"
)

// VerifyPassword checks if the given password matches the hashed password stored in the field.
func VerifyPassword(hashedPassword, password string) error {
	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}
