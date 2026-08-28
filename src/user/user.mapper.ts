import type { User } from '../generated/prisma/client';

export type PublicUser = {
  id: string;
  email: string;
  username: string;
  rating: number;
  createdAt: Date;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    rating: user.rating,
    createdAt: user.createdAt,
  };
}
