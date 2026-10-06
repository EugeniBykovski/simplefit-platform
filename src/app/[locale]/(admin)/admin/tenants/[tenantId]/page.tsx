import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.tenants._tenant-id");

export const generateMetadata = route.generateMetadata;
export default route.Page;
