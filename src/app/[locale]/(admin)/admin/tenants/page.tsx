import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.tenants");

export const generateMetadata = route.generateMetadata;
export default route.Page;
