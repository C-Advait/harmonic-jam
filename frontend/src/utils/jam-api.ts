import axios from 'axios';

export interface ICompany {
    id: number;
    company_name: string;
    liked: boolean;
}

export interface ICollection {
    id: string;
    collection_name: string;
    companies: ICompany[];
    total: number;
}

export interface ICompanyBatchResponse {
    companies: ICompany[];
}

const BASE_URL = 'http://localhost:8000';

export async function getCompanies(offset?: number, limit?: number): Promise<ICompanyBatchResponse> {
    try {
        const response = await axios.get(`${BASE_URL}/companies`, {
            params: {
                offset,
                limit,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export async function getCollectionsById(id: string, offset?: number, limit?: number): Promise<ICollection> {
    try {
        const response = await axios.get(`${BASE_URL}/collections/${id}`, {
            params: {
                offset,
                limit,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export async function getCollectionsMetadata(): Promise<ICollection[]> {
    try {
        const response = await axios.get(`${BASE_URL}/collections`);
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

// New transfer interfaces
export interface ITransferRequest {
    target_collection_id: string;
    company_ids?: number[];
    transfer_all?: boolean;
}

export interface ITransferResponse {
    job_id: string;
    message: string;
    total_companies: number;
}

export interface ITransferStatus {
    job_id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    progress: number;
    total: number;
    message: string;
    sourceCollectionName?: string;
    targetCollectionName?: string;
    completedAt?: number;  // Timestamp for sorting completed transfers
}

// Start a transfer operation
export async function startTransfer(
    sourceCollectionId: string,
    targetCollectionId: string,
    companyIds?: number[],
    transferAll: boolean = false
): Promise<ITransferResponse> {
    try {
        const response = await axios.post(`${BASE_URL}/collections/${sourceCollectionId}/transfer`, {
            target_collection_id: targetCollectionId,
            company_ids: companyIds,
            transfer_all: transferAll
        });
        return response.data;
    } catch (error) {
        console.error('Error starting transfer:', error);
        throw error;
    }
}

// Get transfer status
export async function getTransferStatus(jobId: string): Promise<ITransferStatus> {
    try {
        const response = await axios.get(`${BASE_URL}/collections/transfer-status/${jobId}`);
        return response.data;
    } catch (error) {
        console.error('Error getting transfer status:', error);
        throw error;
    }
} 