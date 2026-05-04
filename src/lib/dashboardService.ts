// lib/dashboardService.ts - Fixed TypeScript issues
import { AzureBlobService, BlobInfo } from './azure';
import { csvParser } from './csvParser';

export interface DashboardData {
  camelTracker: {
    latest: any[];
    metadata: any;
    history: HistoricalSession[];
  };
  jockeyRobot: {
    latest: any[];
    metadata: any;
    history: HistoricalSession[];
  };
  summary: {
    totalBlobs: number;
    lastUpdate: Date;
    dataQuality: {
      camelTrackerRecords: number;
      jockeyRobotRecords: number;
    };
  };
}

export interface HistoricalSession {
  blobName: string;
  lastModified: Date;
  recordCount: number;
  statistics: {
    averageSpeed: number;
    maxSpeed: number;
    totalDistance?: number;
    duration?: number;
  };
}

export class DashboardService {
  private azureService: AzureBlobService;
  
  constructor(containerId: string = 'trainingdata') {
    this.azureService = new AzureBlobService(containerId);
  }
  
  async getLatestCamelTrackerData() {
    const blobs = await this.azureService.listBlobs();
    const camelBlobs = blobs.filter(b => 
      b.name.startsWith('race_') && 
      b.name.endsWith('.csv') &&
      !b.name.includes('tracker_')
    );
    
    if (camelBlobs.length === 0) return null;
    
    const latestBlob = camelBlobs[0];
    const csvContent = await this.azureService.downloadBlob(latestBlob.name);
    const parsed = await csvParser.parseFromString(csvContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true
    });
    
    return {
      data: csvParser.transformForDashboard(parsed, {
        numericFields: ['Time', 'Lat', 'Lon', 'Speed', 'Accel', 'Dist', 'AccX', 'AccY', 'AccZ']
      }),
      metadata: {
        blobName: latestBlob.name,
        lastModified: latestBlob.lastModified,
        size: latestBlob.size
      }
    };
  }
  
  async getLatestJockeyRobotData() {
    const blobs = await this.azureService.listBlobs();
    const jockeyBlobs = blobs.filter(b => 
      b.name.startsWith('tracker_') && 
      b.name.endsWith('.csv')
    );
    
    if (jockeyBlobs.length === 0) return null;
    
    const latestBlob = jockeyBlobs[0];
    const csvContent = await this.azureService.downloadBlob(latestBlob.name);
    const parsed = await csvParser.parseFromString(csvContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true
    });
    
    return {
      data: csvParser.transformForDashboard(parsed, {
        numericFields: [
          'Latitude', 'Longitude', 'Speed(km/', 'Acceleratio',
          'Altitude(m', 'Satellites', 'AccelX', 'AccelY', 'AccelZ',
          'GyroX', 'GyroY', 'GyroZ', 'Temp(C)', 'Distance(m)'
        ]
      }),
      metadata: {
        blobName: latestBlob.name,
        lastModified: latestBlob.lastModified,
        size: latestBlob.size
      }
    };
  }
  
  async getCamelTrackerHistory(): Promise<HistoricalSession[]> {
    const blobs = await this.azureService.listBlobs();
    const camelBlobs = blobs.filter(b => 
      b.name.startsWith('race_') && 
      b.name.endsWith('.csv') &&
      !b.name.includes('tracker_')
    );
    
    const historyPromises = camelBlobs.map(async (blob): Promise<HistoricalSession | null> => {
      try {
        const csvContent = await this.azureService.downloadBlob(blob.name);
        const parsed = await csvParser.parseFromString(csvContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true
        });
        
        const data = parsed.data;
        const speeds = data.map((d: any) => d.Speed || 0).filter((s: number) => s > 0);
        const distances = data.map((d: any) => d.Dist || 0);
        
        return {
          blobName: blob.name,
          lastModified: blob.lastModified!,
          recordCount: data.length,
          statistics: {
            averageSpeed: speeds.length > 0 
              ? speeds.reduce((a: number, b: number) => a + b, 0) / speeds.length 
              : 0,
            maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
            totalDistance: distances.length > 0 ? Math.max(...distances) : undefined
          }
        };
      } catch (error) {
        console.error(`Error processing ${blob.name}:`, error);
        return null;
      }
    });
    
    const history = await Promise.all(historyPromises);
    return history.filter((h): h is HistoricalSession => h !== null);
  }
  
  async getJockeyRobotHistory(): Promise<HistoricalSession[]> {
    const blobs = await this.azureService.listBlobs();
    const jockeyBlobs = blobs.filter(b => 
      b.name.startsWith('tracker_') && 
      b.name.endsWith('.csv')
    );
    
    const historyPromises = jockeyBlobs.map(async (blob): Promise<HistoricalSession | null> => {
      try {
        const csvContent = await this.azureService.downloadBlob(blob.name);
        const parsed = await csvParser.parseFromString(csvContent, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: true
        });
        
        const data = parsed.data;
        const speeds = data.map((d: any) => d['Speed(km/'] || 0).filter((s: number) => s > 0);
        const distances = data.map((d: any) => d['Distance(m)'] || 0);
        
        return {
          blobName: blob.name,
          lastModified: blob.lastModified!,
          recordCount: data.length,
          statistics: {
            averageSpeed: speeds.length > 0 
              ? speeds.reduce((a: number, b: number) => a + b, 0) / speeds.length 
              : 0,
            maxSpeed: speeds.length > 0 ? Math.max(...speeds) : 0,
            totalDistance: distances.length > 0 ? Math.max(...distances) : undefined
          }
        };
      } catch (error) {
        console.error(`Error processing ${blob.name}:`, error);
        return null;
      }
    });
    
    const history = await Promise.all(historyPromises);
    return history.filter((h): h is HistoricalSession => h !== null);
  }
  
  async getAllDashboardData(): Promise<DashboardData> {
    const [camelData, jockeyData, camelHistory, jockeyHistory] = await Promise.all([
      this.getLatestCamelTrackerData(),
      this.getLatestJockeyRobotData(),
      this.getCamelTrackerHistory(),
      this.getJockeyRobotHistory()
    ]);
    
    const blobs = await this.azureService.listBlobs();
    
    return {
      camelTracker: {
        latest: camelData?.data || [],
        metadata: camelData?.metadata || {},
        history: camelHistory
      },
      jockeyRobot: {
        latest: jockeyData?.data || [],
        metadata: jockeyData?.metadata || {},
        history: jockeyHistory
      },
      summary: {
        totalBlobs: blobs.length,
        lastUpdate: new Date(),
        dataQuality: {
          camelTrackerRecords: camelData?.data?.length || 0,
          jockeyRobotRecords: jockeyData?.data?.length || 0
        }
      }
    };
  }
}

export const dashboardService = new DashboardService();