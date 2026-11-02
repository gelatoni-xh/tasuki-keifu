const DISCIPLINE_DISTANCE_ORDER: Record<string, number> = {
  m800: 800,
  m1500: 1500,
  m2000sc: 2000,
  m3000: 3000,
  m3000sc: 3000,
  m5000: 5000,
  m10000: 10000,
  ten_mile: 16093,
  half_marathon: 21098,
  marathon: 42195,
  ekiden_leg: Number.MAX_SAFE_INTEGER,
};

function parseHeatOrder(heat: string | null | undefined) {
  if (!heat) {
    return Number.MAX_SAFE_INTEGER;
  }

  const match = heat.match(/(\d+)/u);
  return match ? Number.parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
}

function parseRoundOrder(round: string | null | undefined) {
  switch (round) {
    case "予選":
      return 1;
    case "準決勝":
      return 2;
    case "決勝":
      return 3;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

function parseDivisionOrder(name: string) {
  const match = name.match(/(\d+)部/u);
  return match ? Number.parseInt(match[1]!, 10) : 0;
}

export function compareRaceUnits(
  left: { discipline: string; distanceMeters?: number | null; round?: string | null; heat?: string | null; name: string; leg?: number | null; startsAt?: Date | null },
  right: { discipline: string; distanceMeters?: number | null; round?: string | null; heat?: string | null; name: string; leg?: number | null; startsAt?: Date | null },
) {
  // Relay legs follow course order; their distances are not monotonic.
  if (left.discipline === "ekiden_leg" && right.discipline === "ekiden_leg") {
    const leftLeg = left.leg ?? Number.MAX_SAFE_INTEGER;
    const rightLeg = right.leg ?? Number.MAX_SAFE_INTEGER;
    if (leftLeg !== rightLeg) {
      return leftLeg - rightLeg;
    }
  }

  const leftDistance = left.distanceMeters ?? DISCIPLINE_DISTANCE_ORDER[left.discipline] ?? Number.MAX_SAFE_INTEGER;
  const rightDistance = right.distanceMeters ?? DISCIPLINE_DISTANCE_ORDER[right.discipline] ?? Number.MAX_SAFE_INTEGER;
  if (leftDistance !== rightDistance) {
    return leftDistance - rightDistance;
  }

  const leftIsSc = left.discipline.endsWith("sc");
  const rightIsSc = right.discipline.endsWith("sc");
  if (leftIsSc !== rightIsSc) {
    return leftIsSc ? 1 : -1;
  }

  const leftDivision = parseDivisionOrder(left.name);
  const rightDivision = parseDivisionOrder(right.name);
  if (leftDivision !== rightDivision) {
    return leftDivision - rightDivision;
  }

  const leftRound = parseRoundOrder(left.round);
  const rightRound = parseRoundOrder(right.round);
  if (leftRound !== rightRound) {
    return leftRound - rightRound;
  }

  const leftHeat = parseHeatOrder(left.heat);
  const rightHeat = parseHeatOrder(right.heat);
  if (leftHeat !== rightHeat) {
    return leftHeat - rightHeat;
  }

  const leftStart = left.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const rightStart = right.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (leftStart !== rightStart) {
    return leftStart - rightStart;
  }

  return left.name.localeCompare(right.name, "ja");
}


export function formatCompetitionDate(date: Date | null | undefined) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

