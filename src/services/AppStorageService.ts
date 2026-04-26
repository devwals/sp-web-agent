export class AppStorageService {
    private static _instance: AppStorageService;

    public apiEndpoint: string;
    public apiKey: string;

    private constructor() { }

    public static getInstance(): AppStorageService {
        if (!AppStorageService._instance) AppStorageService._instance = new AppStorageService();
        return AppStorageService._instance;
    }
}