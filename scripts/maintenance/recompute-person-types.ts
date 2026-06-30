import "dotenv/config";

import type { MembershipRole, PersonType } from "@prisma/client";
import { prisma } from "../lib/prisma";

function isCurrentMembership(
  membership: { startDate: Date | null; endDate: Date | null },
  now = new Date(),
) {
  const startsBeforeNow = !membership.startDate || membership.startDate <= now;
  const hasNotEnded = !membership.endDate || membership.endDate >= now;

  return startsBeforeNow && hasNotEnded;
}

function getRolePriority(role: MembershipRole) {
  switch (role) {
    case "coach":
      return 3;
    case "staff":
      return 2;
    case "athlete":
    default:
      return 1;
  }
}

function derivePersonType(
  memberships: Array<{ role: MembershipRole; startDate: Date | null; endDate: Date | null }>,
  fallback: PersonType,
  now = new Date(),
): PersonType {
  const currentMemberships = memberships
    .filter((membership) => isCurrentMembership(membership, now))
    .sort((left, right) => getRolePriority(right.role) - getRolePriority(left.role));

  if (currentMemberships.length > 0) {
    return currentMemberships[0].role;
  }

  const latestEndedMembership = memberships
    .filter((membership) => membership.endDate)
    .sort((left, right) => (right.endDate?.getTime() ?? 0) - (left.endDate?.getTime() ?? 0))[0];

  return latestEndedMembership?.role ?? fallback;
}

async function main() {
  const people = await prisma.person.findMany({
    include: {
      memberships: {
        select: {
          role: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  let updatedCount = 0;

  for (const person of people) {
    const nextType = derivePersonType(person.memberships, person.type);

    if (nextType === person.type) {
      continue;
    }

    await prisma.person.update({
      where: { id: person.id },
      data: { type: nextType },
    });
    updatedCount += 1;
  }

  console.log(JSON.stringify({
    checkedPeople: people.length,
    updatedCount,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
