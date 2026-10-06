import { placeholderRoute } from "@/widgets/feature-placeholder";

const route = placeholderRoute("web.admin.sponsors._sponsor-id");

export const generateMetadata = route.generateMetadata;
export default route.Page;
