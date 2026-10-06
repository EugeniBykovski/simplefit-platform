import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.enterprise");

export const generateMetadata = route.generateMetadata;
export default route.Page;
