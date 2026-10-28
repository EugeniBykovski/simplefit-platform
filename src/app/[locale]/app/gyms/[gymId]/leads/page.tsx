import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.app.gyms._gym-id.leads");

export const generateMetadata = route.generateMetadata;
export default route.Page;
