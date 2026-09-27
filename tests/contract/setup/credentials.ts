/** The staff login the locked test stages use (php-basic, php-access). The hash was made once with
    php -r 'echo password_hash("correct horse:battery staple", PASSWORD_BCRYPT, ["cost" => 4]);'
    Cost 4 keeps each request fast and is still a bcrypt hash AccessRule accepts. The colon in the password is
    deliberate: Basic auth splits on the first one only. */
export const TEST_LOGIN = {
  user: 'staff',
  password: 'correct horse:battery staple',
  passwordHash: '$2y$04$EmjOK0a.VnF4ly6rGN5i4O58TI4/aUwKZksuLFSYJRt0f3M6Qvv5e',
} as const;
