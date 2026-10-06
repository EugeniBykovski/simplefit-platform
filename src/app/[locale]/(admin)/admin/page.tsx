import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin");

export const generateMetadata = route.generateMetadata;
export default route.Page;
