import {describe, expect, it} from 'vitest';

import {AUTH_MESSAGES, signInSchema, signUpSchema} from './auth-schemas';
import {validate} from './validate';

const validSignUp = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct horse',
};

describe('signUpSchema', () => {
  it('accepts a valid sign-up and trims spaces', () => {
    const result = validate(signUpSchema, {
      ...validSignUp,
      name: '  Ada Lovelace  ',
      email: '  ada@example.com ',
    });

    expect(result).toEqual({
      success: true,
      data: {...validSignUp, name: 'Ada Lovelace'},
    });
  });

  it('requires a name', () => {
    const result = validate(signUpSchema, {...validSignUp, name: '   '});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBe(AUTH_MESSAGES.nameRequired);
    }
  });

  it('rejects a name that is too long', () => {
    const result = validate(signUpSchema, {
      ...validSignUp,
      name: 'a'.repeat(101),
    });

    expect(!result.success && result.errors.name).toBe(
      AUTH_MESSAGES.nameTooLong,
    );
  });

  it('rejects an invalid email', () => {
    const result = validate(signUpSchema, {...validSignUp, email: 'ada@'});

    expect(!result.success && result.errors.email).toBe(
      AUTH_MESSAGES.emailInvalid,
    );
  });

  it('rejects a short password', () => {
    const result = validate(signUpSchema, {...validSignUp, password: 'short'});

    expect(!result.success && result.errors.password).toBe(
      AUTH_MESSAGES.passwordTooShort,
    );
  });

  it('rejects a password that is too long', () => {
    const result = validate(signUpSchema, {
      ...validSignUp,
      password: 'a'.repeat(129),
    });

    expect(!result.success && result.errors.password).toBe(
      AUTH_MESSAGES.passwordTooLong,
    );
  });

  it('reports one message per field and the first message overall', () => {
    const result = validate(signUpSchema, {name: '', email: '', password: ''});

    expect(result).toEqual({
      success: false,
      errors: {
        name: AUTH_MESSAGES.nameRequired,
        email: AUTH_MESSAGES.emailInvalid,
        password: AUTH_MESSAGES.passwordTooShort,
      },
      firstError: AUTH_MESSAGES.nameRequired,
    });
  });

  it('rejects input that is not an object', () => {
    expect(validate(signUpSchema, null).success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('accepts any non-empty password', () => {
    const result = validate(signInSchema, {
      email: 'ada@example.com',
      password: 'x',
    });

    expect(result.success).toBe(true);
  });

  it('requires a password', () => {
    const result = validate(signInSchema, {
      email: 'ada@example.com',
      password: '',
    });

    expect(!result.success && result.errors.password).toBe(
      AUTH_MESSAGES.passwordRequired,
    );
  });

  it('rejects an invalid email', () => {
    const result = validate(signInSchema, {email: 'nope', password: 'x'});

    expect(!result.success && result.errors.email).toBe(
      AUTH_MESSAGES.emailInvalid,
    );
  });
});
