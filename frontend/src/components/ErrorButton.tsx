// frontend/src/components/ErrorButton.tsx
import * as Sentry from "@sentry/react";

export function ErrorButton() {
  return (
    <button
      onClick={() => {
        // errore intenzionale per test Sentry
        throw new Error("This is your first error!");
      }}
      className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm mt-4"
    >
      Break the world
    </button>
  );
}
