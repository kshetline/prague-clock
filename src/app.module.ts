import { NgModule } from '@angular/core';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { BrowserModule } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { DropdownModule } from 'primeng/dropdown';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { FormsModule } from '@angular/forms';
import { HttpClientJsonpModule, HttpClientModule } from '@angular/common/http';
import { MenuModule } from 'primeng/menu';
import { RadioButtonModule } from 'primeng/radiobutton';
import { TieredMenuModule } from 'primeng/tieredmenu';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { TubularNgWidgetsModule } from '@tubular/ng-widgets';

import { AppComponent } from './app/app.component';
import { TimezoneSelectorComponent } from './timezone-selector/timezone-selector.component';
import { AdvancedOptionsComponent } from './advanced-options/advanced-options.component';
import { SafeHtmlPipe } from './svg/svg';

@NgModule({
  declarations: [
    AppComponent,
    AdvancedOptionsComponent,
    TimezoneSelectorComponent,
    SafeHtmlPipe
  ],
  imports: [
    AutoCompleteModule,
    BrowserModule,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    DropdownModule,
    FontAwesomeModule,
    FormsModule,
    HttpClientJsonpModule,
    HttpClientModule,
    MenuModule,
    RadioButtonModule,
    TieredMenuModule,
    ToastModule,
    TooltipModule,
    TubularNgWidgetsModule
  ],
  providers: [ConfirmationService, MessageService],
  bootstrap: [AppComponent]
})
export class AppModule { }
