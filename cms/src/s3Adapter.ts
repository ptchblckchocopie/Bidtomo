import type { Adapter } from '@payloadcms/plugin-cloud-storage/dist/types';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import path from 'path';

export interface S3AdapterArgs {
  bucket: string;
  config: {
    credentials: {
      accessKeyId: string;
      secretAccessKey: string;
    };
    region: string;
    endpoint?: string;
    forcePathStyle?: boolean;
  };
  acl?: 'private' | 'public-read';
}

export const s3Adapter = ({
  bucket,
  config,
  acl = 'public-read',
}: S3AdapterArgs): Adapter => {
  return ({ collection, prefix }) => {
    const s3Client = new S3Client(config);

    return {
      name: 's3-adapter',

      async handleUpload({ file, data }) {
        try {
          const fileKey = path.posix.join(prefix || '', file.filename);

          const upload = new Upload({
            client: s3Client,
            params: {
              Bucket: bucket,
              Key: fileKey,
              Body: file.buffer,
              ContentType: file.mimeType,
              ACL: acl,
            },
          });

          await upload.done();

          return data;
        } catch (error) {
          console.error('Error uploading to S3:', error);
          throw error;
        }
      },

      async handleDelete({ filename }) {
        try {
          const fileKey = path.posix.join(prefix || '', filename);

          await s3Client.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              Key: fileKey,
            })
          );
        } catch (error) {
          console.error('Error deleting from S3:', error);
          throw error;
        }
      },

      async staticHandler({ params }) {
        try {
          const fileKey = path.posix.join(prefix || '', params.filename);

          const command = new GetObjectCommand({
            Bucket: bucket,
            Key: fileKey,
          });

          const response = await s3Client.send(command);

          if (!response.Body) {
            return new Response('File not found', { status: 404 });
          }

          // Convert stream to buffer
          const chunks: any[] = [];
          // @ts-ignore
          for await (const chunk of response.Body) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);

          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': response.ContentType || 'application/octet-stream',
              'Content-Length': response.ContentLength?.toString() || buffer.length.toString(),
            },
          });
        } catch (error) {
          console.error('Error fetching from S3:', error);
          return new Response('Error fetching file', { status: 500 });
        }
      },

      generateURL: ({ filename }) => {
        const fileKey = path.posix.join(prefix || '', filename);
        // Generate the public URL for Digital Ocean Spaces
        return `https://${bucket}.${config.region}.digitaloceanspaces.com/${fileKey}`;
      },
    };
  };
};
