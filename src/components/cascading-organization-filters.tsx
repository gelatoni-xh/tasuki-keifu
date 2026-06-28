"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

type CascadingOrganizationFiltersProps = {
  allLabel: string;
  organizationLabel: string;
  organizationOptions: Array<{
    id: string;
    label: string;
    slug: string;
    type: string;
  }>;
  organizationTypeLabel: string;
  organizationTypes: Array<{
    label: string;
    value: string;
  }>;
  selectedOrganization: string;
  selectedOrganizationType: string;
};

export function CascadingOrganizationFilters({
  allLabel,
  organizationLabel,
  organizationOptions,
  organizationTypeLabel,
  organizationTypes,
  selectedOrganization,
  selectedOrganizationType,
}: CascadingOrganizationFiltersProps) {
  const [organizationType, setOrganizationType] = useState(selectedOrganizationType);
  const [organization, setOrganization] = useState(selectedOrganization);
  const filteredOrganizationOptions = organizationType
    ? organizationOptions.filter((organization) => organization.type === organizationType)
    : organizationOptions;
  const selectedOrganizationStillVisible = filteredOrganizationOptions.some(
    (option) => option.slug === organization,
  );

  return (
    <>
      <label className="flex items-center gap-2 border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2">
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-[#8a1f2d]" aria-hidden="true" />
        <span className="sr-only">{organizationTypeLabel}</span>
        <select
          className="w-full bg-transparent text-sm outline-none"
          name="organizationType"
          onChange={(event) => {
            const nextOrganizationType = event.currentTarget.value;
            setOrganizationType(nextOrganizationType);
            setOrganization("");
          }}
          value={organizationType}
        >
          <option value="">{allLabel}</option>
          {organizationTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <label className="border border-[#cfc7b8] bg-[#fbfaf7] px-3 py-2">
        <span className="sr-only">{organizationLabel}</span>
        <select
          className="w-full bg-transparent text-sm outline-none"
          name="organization"
          onChange={(event) => {
            setOrganization(event.currentTarget.value);
          }}
          value={selectedOrganizationStillVisible ? organization : ""}
        >
          <option value="">{allLabel}</option>
          {filteredOrganizationOptions.map((organization) => (
            <option key={organization.id} value={organization.slug}>
              {organization.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
