import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

let _client = null;
function getClient() {
  if (_client) return _client;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export function isR2Configured() {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME && process.env.R2_PUBLIC_URL_BASE);
}

function pathFor(filename) {
  // Organizado por ano-mês para facilitar navegação no Cloudflare
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `instagram/${ym}/${filename}`;
}

function safeFilename(originalName) {
  const dotIdx = originalName.lastIndexOf(".");
  const ext = dotIdx >= 0 ? originalName.slice(dotIdx).toLowerCase() : "";
  const base = randomUUID().slice(0, 12);
  return `${base}${ext}`;
}

export async function uploadBuffer({ buffer, originalName, contentType }) {
  if (!isR2Configured()) throw new Error("R2 não configurado (R2_ACCOUNT_ID/ACCESS_KEY/SECRET/BUCKET_NAME/PUBLIC_URL_BASE)");
  const client = getClient();
  const filename = safeFilename(originalName || "file");
  const key = pathFor(filename);

  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType || "application/octet-stream",
    ContentLength: buffer.length,
  }));

  const publicUrl = `${process.env.R2_PUBLIC_URL_BASE.replace(/\/$/, "")}/${key}`;
  return { key, url: publicUrl, size: buffer.length, contentType };
}

export async function listObjects({ prefix = "instagram/", limit = 100 } = {}) {
  if (!isR2Configured()) throw new Error("R2 não configurado");
  const client = getClient();
  const result = await client.send(new ListObjectsV2Command({
    Bucket: process.env.R2_BUCKET_NAME,
    Prefix: prefix,
    MaxKeys: Math.min(limit, 1000),
  }));
  const items = (result.Contents || []).map((obj) => ({
    key: obj.Key,
    url: `${process.env.R2_PUBLIC_URL_BASE.replace(/\/$/, "")}/${obj.Key}`,
    size: obj.Size,
    lastModified: obj.LastModified,
  }));
  // mais recentes primeiro
  items.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
  return items;
}

export async function deleteObject(key) {
  if (!isR2Configured()) throw new Error("R2 não configurado");
  const client = getClient();
  await client.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  }));
}

export async function objectExists(key) {
  if (!isR2Configured()) return false;
  const client = getClient();
  try {
    await client.send(new HeadObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    }));
    return true;
  } catch {
    return false;
  }
}
