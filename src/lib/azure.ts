// lib/azure.ts
import { BlobServiceClient } from '@azure/storage-blob';

const connectionStrings: Record<number, string | undefined> = {
  0: process.env.AZURE_STORAGE_CONNECTION_STRING,   // ws-tawyeen / ws-frc (primary)
  1: process.env.AZURE_STORAGE_CONNECTION_STRING1,  // aqs-frc (source)
  2: process.env.AZURE_STORAGE_CONNECTION_STRING2,  // weatherststorage01 / weather (destination)
};

export interface BlobInfo {
  etag: any;
  contentType: any;
  name: string;
  lastModified: Date | undefined;
  size: number | undefined;
  url?: string;
}

export class AzureBlobService {
  private blobServiceClient: BlobServiceClient;
  private containerClient;
  private containerId: string;

  /**
   * @param containerId  - Azure container name
   * @param connectionIndex - 0 = primary (STRING), 1 = secondary (STRING1), 2 = tertiary (STRING2)
   */
  constructor(containerId: string, connectionIndex: 0 | 1 | 2 = 0) {
    if (!containerId) throw new Error('Container ID is required');

    this.containerId = containerId;

    const connStr = connectionStrings[connectionIndex];
    if (!connStr) {
      throw new Error(
        `AZURE_STORAGE_CONNECTION_STRING${connectionIndex === 0 ? '' : connectionIndex} not found in environment variables`
      );
    }

    this.blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
    this.containerClient = this.blobServiceClient.getContainerClient(containerId);

    const label = ['primary', 'secondary', 'tertiary'][connectionIndex];
    console.log(`✅ [AZURE SERVICE] Initialized for container: ${containerId} (${label} account)`);
  }

  /**
   * List all blobs in the container, sorted by last modified date (newest first)
   */
  async listBlobs(): Promise<BlobInfo[]> {
    try {
      console.log(`📋 [AZURE SERVICE] Listing blobs in container: ${this.containerId}`);

      const blobs: BlobInfo[] = [];

      for await (const blob of this.containerClient.listBlobsFlat({
        includeMetadata: true,
        includeSnapshots: false,
        includeTags: false,
        includeVersions: false
      })) {
        blobs.push({
          name: blob.name,
          lastModified: blob.properties.lastModified,
          size: blob.properties.contentLength,
          url: `${this.containerClient.url}/${blob.name}`,
          etag: blob.properties.etag || '',
          contentType: blob.properties.contentType || 'application/octet-stream'
        });
      }

      console.log(`✅ [AZURE SERVICE] Found ${blobs.length} blobs in container: ${this.containerId}`);

      return blobs.sort((a, b) => {
        if (!a.lastModified || !b.lastModified) return 0;
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      });
    } catch (error) {
      console.error(`❌ [AZURE SERVICE] Error listing blobs in container ${this.containerId}:`, error);
      throw new Error(`Failed to list blobs: ${error}`);
    }
  }

  /**
   * Download a specific blob content as string
   */
  async downloadBlob(blobName: string): Promise<string> {
    try {
      console.log(`⬇️ [AZURE SERVICE] Downloading blob: ${blobName} from container: ${this.containerId}`);

      const blobClient = this.containerClient.getBlobClient(blobName);

      const exists = await blobClient.exists();
      if (!exists) throw new Error(`Blob ${blobName} does not exist`);

      const downloadResponse = await blobClient.download();
      if (!downloadResponse.readableStreamBody) throw new Error('No content in blob');

      const content = await this.streamToString(downloadResponse.readableStreamBody);
      console.log(`✅ [AZURE SERVICE] Downloaded ${content.length} bytes from ${blobName}`);

      return content;
    } catch (error) {
      console.error(`❌ [AZURE SERVICE] Error downloading blob ${blobName} from container ${this.containerId}:`, error);
      throw new Error(`Failed to download blob ${blobName}: ${error}`);
    }
  }

  /**
   * Upload a blob (string content) to this container
   */
  async uploadBlob(blobName: string, content: string, contentType = 'application/json'): Promise<void> {
    try {
      console.log(`⬆️ [AZURE SERVICE] Uploading blob: ${blobName} to container: ${this.containerId}`);

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(
        content,
        Buffer.byteLength(content),
        { blobHTTPHeaders: { blobContentType: contentType } }
      );

      console.log(`✅ [AZURE SERVICE] Uploaded ${blobName} to container: ${this.containerId}`);
    } catch (error) {
      console.error(`❌ [AZURE SERVICE] Error uploading blob ${blobName} to container ${this.containerId}:`, error);
      throw new Error(`Failed to upload blob ${blobName}: ${error}`);
    }
  }

  /**
   * Convert a readable stream to a string
   */
  private async streamToString(readableStream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readableStream.on('data', (data) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
      readableStream.on('error', reject);
    });
  }

  async getLatestBlob(): Promise<BlobInfo | null> {
    const blobs = await this.listBlobs();
    return blobs.length > 0 ? blobs[0] : null;
  }

  async getBlobsInDateRange(startDate: Date, endDate: Date): Promise<BlobInfo[]> {
    const allBlobs = await this.listBlobs();
    return allBlobs.filter(blob => {
      if (!blob.lastModified) return false;
      const blobDate = new Date(blob.lastModified);
      return blobDate >= startDate && blobDate <= endDate;
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.containerClient.getProperties();
      return true;
    } catch (error) {
      console.error('Azure Storage connection test failed:', error);
      return false;
    }
  }

  getContainerId(): string {
    return this.containerId;
  }

  async containerExists(): Promise<boolean> {
    try {
      await this.containerClient.exists();
      return true;
    } catch (error) {
      console.error(`❌ [AZURE SERVICE] Error checking container existence for ${this.containerId}:`, error);
      return false;
    }
  }
}