import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.transactions");

export const generateMetadata = route.generateMetadata;
export default route.Page;
