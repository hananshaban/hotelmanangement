export interface CreateMaintenanceRequestRequest {
  room_id: string;
  title: string;
  description: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  status?: 'Open' | 'In Progress' | 'Repaired';
  assigned_to?: string;
}

export interface UpdateMaintenanceRequestRequest {
  room_id?: string;
  title?: string;
  description?: string;
  priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
  status?: 'Open' | 'In Progress' | 'Repaired';
  assigned_to?: string;
}

export interface MaintenanceRequestResponse {
  id: string;
  room_id: string;
  room_number: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  assigned_to?: string;
  assigned_to_name?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}



