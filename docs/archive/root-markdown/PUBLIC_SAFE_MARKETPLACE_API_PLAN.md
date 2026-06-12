# Public Safe Marketplace API Plan

Step: 265

## Goal

Allow public marketplace browsing only through allowlisted DTOs.

## Runtime Rule

- Public browse/detail/store endpoints may be unauthenticated only after DTO allowlists are used.
- Private seller dashboard, listing creation/editing, favorite, conversations, sales, reviews, and admin endpoints remain authenticated.

## Implemented in This Phase

- Public marketplace listing endpoints now use allowlisted DTOs.
- Public browse/detail/store routes no longer require auth.
- Private write and admin routes remain protected.

