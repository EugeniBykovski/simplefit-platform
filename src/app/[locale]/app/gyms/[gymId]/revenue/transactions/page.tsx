import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.app.gyms._gym-id.revenue.transactions");

export const generateMetadata = route.generateMetadata;
export default route.Page;
