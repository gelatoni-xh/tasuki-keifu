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
      <label className="filter-field">
        <span className="filter-label">{organizationTypeLabel}</span>
        <div className="relative">
          <SlidersHorizontal
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a1f2d]"
            aria-hidden="true"
          />
          <select
            className="filter-input pl-9"
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
        </div>
      </label>

      <label className="filter-field">
        <span className="filter-label">{organizationLabel}</span>
        <select
          className="filter-input"
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
