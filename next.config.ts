import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        source: "/ja/players/haruto-miyamoto",
        destination: "/ja/players/miyamoto-haruto",
        permanent: true,
      },
      {
        source: "/ja/players/person-ee86b9e794b020e5a4a7e999",
        destination: "/ja/players/person-d009b38532322f79",
        permanent: true,
      },
      {
        source: "/ja/players/person-e78e89e79baee999b82de587",
        destination: "/ja/players/tamame-riku",
        permanent: true,
      },
      {
        source: "/ja/players/person-hokuren2022abashiri-baekseungho",
        destination: "/ja/players/person-kanaguri2025-e3839ae382afe382b9e383b3e3839b",
        permanent: true,
      },
      {
        source: "/ja/players/person-hokuren2024kitami-samuelkibathi",
        destination: "/ja/players/person-toyota-motor",
        permanent: true,
      },
      {
        source: "/ja/players/person-hokuren2024kitami-magomabenuelmogeni",
        destination: "/ja/players/person-asahi-kasei-8fea2dff",
        permanent: true,
      },
      {
        source: "/ja/players/person-e5b2a1efa891e6a8b92de4b8",
        destination: "/ja/players/okazaki-itsuki",
        permanent: true,
      },
      {
        source: "/ja/players/person-e6b0b8e4ba95e9a7bf2de4b9",
        destination: "/ja/players/shun-nagai",
        permanent: true,
      },
      {
        source: "/ja/players/person-e7b6b2e69cace4bdb3e6829f",
        destination: "/ja/players/keigo-amimoto",
        permanent: true,
      },
      {
        source: "/ja/players/person-osaka-gas-2c97745d",
        destination: "/ja/players/mekata-masahiro",
        permanent: true,
      },
      {
        source: "/en/organizations/org-hokuren2024fukagawa-3f03d349b77d507e38d4",
        destination: "/en/organizations/org-hokuren2025fukagawa-41c18971e1c551238ec6",
        permanent: true,
      },
      {
        source: "/ja/players/person-hokuren2025shibetsu-musonimuiru",
        destination: "/ja/players/person-4d2ee383a0e382a4e383ab",
        permanent: true,
      },
      {
        source: "/ko/players/person-hokuren2026chitose-kiptumvictor",
        destination: "/ko/players/person-yaskawa-electric-b410e01b",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
