#!/bin/bash
set -e
npm install
npx drizzle-kit generate
npx drizzle-kit migrate
