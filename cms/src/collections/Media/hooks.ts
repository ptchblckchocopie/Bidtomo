import { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload/types';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';

export const afterChangeHook: CollectionAfterChangeHook = async ({ req, doc, operation }) => {
  // Only upload to S3 on create operations and if S3 is configured
  if (operation === 'create' && process.env.S3_ACCESS_KEY_ID && doc.filename) {
    setImmediate(async () => {
      try {
        const s3Client = (req.payload as any).s3Client;
        if (!s3Client) return;

        const bucket = process.env.S3_BUCKET!;
        const region = process.env.S3_REGION!;

        // Upload main file
        const mainFilePath = path.resolve(process.cwd(), 'media', doc.filename);
        if (fs.existsSync(mainFilePath)) {
          const fileContent = fs.readFileSync(mainFilePath);
          const s3Key = `bidmoto/${doc.filename}`;

          await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: fileContent,
            ContentType: doc.mimeType,
            ACL: 'public-read',
          }));

          // Update URL to S3 location
          const s3Url = `https://${bucket}.${region}.digitaloceanspaces.com/${s3Key}`;
          await req.payload.update({
            collection: 'media',
            id: doc.id,
            data: {
              url: s3Url,
            },
          });

          // Delete local file after successful upload
          fs.unlinkSync(mainFilePath);
          console.log(`Uploaded ${doc.filename} to S3 and deleted local file`);
        }

        // Upload thumbnail if exists
        if (doc.sizes?.thumbnail?.filename) {
          const thumbPath = path.resolve(process.cwd(), 'media', doc.sizes.thumbnail.filename);
          if (fs.existsSync(thumbPath)) {
            const thumbContent = fs.readFileSync(thumbPath);
            const thumbKey = `bidmoto/${doc.sizes.thumbnail.filename}`;

            await s3Client.send(new PutObjectCommand({
              Bucket: bucket,
              Key: thumbKey,
              Body: thumbContent,
              ContentType: doc.sizes.thumbnail.mimeType,
              ACL: 'public-read',
            }));

            // Update thumbnail URL
            const thumbUrl = `https://${bucket}.${region}.digitaloceanspaces.com/${thumbKey}`;
            await req.payload.update({
              collection: 'media',
              id: doc.id,
              data: {
                sizes: {
                  ...doc.sizes,
                  thumbnail: {
                    ...doc.sizes.thumbnail,
                    url: thumbUrl,
                  },
                },
              },
            });

            fs.unlinkSync(thumbPath);
            console.log(`Uploaded thumbnail to S3 and deleted local file`);
          }
        }

        // Upload card size if exists
        if (doc.sizes?.card?.filename) {
          const cardPath = path.resolve(process.cwd(), 'media', doc.sizes.card.filename);
          if (fs.existsSync(cardPath)) {
            const cardContent = fs.readFileSync(cardPath);
            const cardKey = `bidmoto/${doc.sizes.card.filename}`;

            await s3Client.send(new PutObjectCommand({
              Bucket: bucket,
              Key: cardKey,
              Body: cardContent,
              ContentType: doc.sizes.card.mimeType,
              ACL: 'public-read',
            }));

            // Update card URL
            const cardUrl = `https://${bucket}.${region}.digitaloceanspaces.com/${cardKey}`;
            await req.payload.update({
              collection: 'media',
              id: doc.id,
              data: {
                sizes: {
                  ...doc.sizes,
                  card: {
                    ...doc.sizes.card,
                    url: cardUrl,
                  },
                },
              },
            });

            fs.unlinkSync(cardPath);
            console.log(`Uploaded card size to S3 and deleted local file`);
          }
        }
      } catch (error) {
        console.error('Error uploading to S3:', error);
      }
    });
  }
  return doc;
};

export const afterDeleteHook: CollectionAfterDeleteHook = async ({ req, doc }) => {
  // Delete from S3 when media is deleted
  if (process.env.S3_ACCESS_KEY_ID && doc.filename) {
    setImmediate(async () => {
      try {
        const s3Client = (req.payload as any).s3Client;
        if (!s3Client) return;

        const bucket = process.env.S3_BUCKET!;

        // Delete main file
        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: `bidmoto/${doc.filename}`,
        }));

        // Delete thumbnail
        if (doc.sizes?.thumbnail?.filename) {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: `bidmoto/${doc.sizes.thumbnail.filename}`,
          }));
        }

        // Delete card size
        if (doc.sizes?.card?.filename) {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: `bidmoto/${doc.sizes.card.filename}`,
          }));
        }

        console.log(`Deleted ${doc.filename} and its sizes from S3`);
      } catch (error) {
        console.error('Error deleting from S3:', error);
      }
    });
  }
};
