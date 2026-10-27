import { pool } from "../db";

export type Brand = {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  owner_id: string | null;
  ownership_status: string;
  segment: string;
};
export type Branch = {
  id: string;
  brand_id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  hours: string | null;
  active: boolean;
};

// Filiais (Minas Farma / Farma e Farma) e unidades: poucas linhas, lidas em quase toda página.
export async function getBrands(): Promise<Brand[]> {
  return (
    await pool.query(
      `select id, slug, name, aliases,owner_id,ownership_status,segment from brands order by name`,
    )
  ).rows;
}

export async function getBranches(): Promise<Branch[]> {
  return (
    await pool.query(
      `select id, brand_id, name, city, address, phone, hours, active from branches order by name`,
    )
  ).rows;
}
