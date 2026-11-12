// Badge progress, persisted per device in localStorage.
// Kept separate from game logic so storage can be swapped later.

const KEY = "pyladies-game:v1";

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      earned: Array.isArray(data.earned) ? data.earned : [],
      correctIds: Array.isArray(data.correctIds) ? data.correctIds : [],
    };
  } catch {
    return { earned: [], correctIds: [] };
  }
}

function write(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Private mode or storage blocked: progress lives only for this page load.
  }
}

export function createBadgeStore() {
  const state = read();
  const earned = new Set(state.earned);
  const correctIds = new Set(state.correctIds);
  const persist = () => write({ earned: [...earned], correctIds: [...correctIds] });

  return {
    earned,
    correctIds,
    addCorrect(id) {
      correctIds.add(id);
      persist();
    },
    // Returns true when the badge is newly earned.
    award(id) {
      if (earned.has(id)) return false;
      earned.add(id);
      persist();
      return true;
    },
    clear() {
      earned.clear();
      correctIds.clear();
      persist();
    },
  };
}
