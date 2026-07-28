import type { NextConfig } from "next";

const playerSlugRedirects = [
  {
    source: "/ja/players/person-nittaidai324-5e12a45e5b3a94345664",
    destination: "/ja/players/nakagawa-takumi-masuda-seifu",
  },
  {
    source: "/ja/players/person-e4b8ade5b79d20e68b93e6b5",
    destination: "/ja/players/nakagawa-takumi-masuda-seifu",
  },
  {
    source: "/ja/players/person-e4bd90e897a420e58ca0",
    destination: "/ja/players/sato-takumi-sapporo-gakuin",
  },
  {
    source: "/ja/players/person-e5898de794b020e999bde590",
    destination: "/ja/players/maeda-hinata-kagoshima-josei",
  },
  {
    source: "/ja/players/person-nittaidai329-eff162a260601d7821f4",
    destination: "/ja/players/kojima-daiki-mikata",
  },
  {
    source: "/ja/players/person-nittaidai324-1611f58a45b3bd8b24f5",
    destination: "/ja/players/kojima-daiki-mikata",
  },
  {
    source: "/ja/players/person-e5b08fe5b3b620e5a4a7e8bc",
    destination: "/ja/players/kojima-daiki-mikata",
  },
  {
    source: "/ja/players/person-jusic2021-e69c8de983a8e587b1e69d8f",
    destination: "/ja/players/hattori-kaishin",
  },
  {
    source: "/ja/players/person-nittaidai329-a13e0da807bb654c9f7a",
    destination: "/ja/players/higuchi-shota-oita-tomei",
  },
  {
    source: "/ja/players/person-e6a88be58fa320e7bf94e5a4",
    destination: "/ja/players/higuchi-shota-oita-tomei",
  },
  {
    source: "/ja/players/person-kanaguri2025-e6ba90e8a395e8b2b4",
    destination: "/ja/players/minamoto-hiroki",
  },
  {
    source: "/ja/players/person-kao-4367c7eb",
    destination: "/ja/players/ishii-yukichi",
  },
  {
    source: "/ja/players/person-kanaguri2025-e88d92e4ba95e4b883e6b5b7",
    destination: "/ja/players/arai-nanami",
  },
  {
    source: "/ja/players/person-e897a4e4ba9520e99b84e5a4",
    destination: "/ja/players/fujii-yudai-oita-nishi",
  },
  {
    source: "/ja/players/person-e8a5bfe794b020e5a3aee5bf",
    destination: "/ja/players/nishida-soji-kokoku-high-school",
  },
].map((redirect) => ({
  ...redirect,
  permanent: true,
}));

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        source: "/sitemap.xml",
        destination: "/sitemap-index.xml",
        permanent: true,
      },
      ...playerSlugRedirects,
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
