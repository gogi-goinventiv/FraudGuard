// File: pages/api/risk-settings.ts
import { promises as fs } from 'fs';
import path from 'path';
import type { NextApiRequest, NextApiResponse } from 'next';

type RiskSettings = {
  flagHighRisk: boolean;
  flagMediumRisk: boolean;
  flagLowRisk: boolean;
};

type ApiResponse = RiskSettings | { message: string } | { error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  const filePath = path.join(process.cwd(), 'config', 'risk-settings.json');

  // GET request - retrieve current settings
  if (req.method === 'GET') {
    try {
      const fileData = await fs.readFile(filePath, 'utf8');
      const riskSettings: RiskSettings = JSON.parse(fileData);
      return res.status(200).json(riskSettings);
    } catch (error) {
      console.error('Error reading risk settings:', error);
      return res.status(500).json({ error: 'Failed to load risk settings' });
    }
  }
  
  // PUT request - update settings
  else if (req.method === 'PUT') {
    try {
      const { flagHighRisk, flagMediumRisk, flagLowRisk } = req.body;
      
      // Validate required fields
      if (typeof flagHighRisk !== 'boolean' || 
          typeof flagMediumRisk !== 'boolean' || 
          typeof flagLowRisk !== 'boolean') {
        return res.status(400).json({ 
          error: 'Invalid settings. All flags must be boolean values.' 
        });
      }
      
      const newSettings: RiskSettings = {
        flagHighRisk,
        flagMediumRisk,
        flagLowRisk
      };
      
      // Write the updated settings to the file
      await fs.writeFile(
        filePath, 
        JSON.stringify(newSettings, null, 2),
        'utf8'
      );
      
      return res.status(200).json({ 
        message: 'Risk settings updated successfully',
        ...newSettings
      });
    } catch (error) {
      console.error('Error updating risk settings:', error);
      return res.status(500).json({ error: 'Failed to update risk settings' });
    }
  }
  
  // Method not allowed
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}