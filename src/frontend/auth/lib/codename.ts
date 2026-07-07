const ADJ = [
  "Amber", "Quiet", "Hidden", "Velvet", "Copper", "Dusk", "Wild", "Slate", "Golden", "Misty",
  "Ember", "Cedar", "Indigo", "Hazel", "Onyx", "Sable", "Maple", "Frost", "Clay", "Ochre",
  "Russet", "Umber", "Dune", "Birch",
];
const ANIMAL = [
  "Heron", "Otter", "Fox", "Lynx", "Marten", "Falcon", "Bison", "Crane", "Wren", "Tapir",
  "Ibis", "Stag", "Mole", "Hare", "Owl", "Seal", "Finch", "Shrew", "Kite", "Vole", "Quail",
  "Roe", "Loon", "Mink",
];

function hashCode(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function codenameFor(addr: string): string {
  const h = hashCode((addr || "").toLowerCase());
  return `${ADJ[h % ADJ.length]} ${ANIMAL[(h >> 7) % ANIMAL.length]}`;
}
